"""SQLite-backed fault tracking store.

Keeps a durable history of detected faults (predicted by the classifier
on live telemetry) so the dashboard can show trends over time even
across backend restarts. Each row represents one fault "episode" on a
component: it opens when the classifier first detects the fault above
the confidence threshold, and closes when the component returns to a
healthy classification.
"""

from __future__ import annotations

import sqlite3
import time
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "faults.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS faults (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fault_id TEXT NOT NULL,
    component_type TEXT NOT NULL,
    component_key TEXT NOT NULL,
    node INTEGER,
    severity TEXT NOT NULL,
    layer TEXT NOT NULL DEFAULT 'gpu_health',
    confidence REAL NOT NULL,
    max_confidence REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    started_at REAL NOT NULL,
    updated_at REAL NOT NULL,
    resolved_at REAL
);
CREATE INDEX IF NOT EXISTS idx_faults_status ON faults(status);
CREATE INDEX IF NOT EXISTS idx_faults_fault_id ON faults(fault_id);
CREATE INDEX IF NOT EXISTS idx_faults_started_at ON faults(started_at);
"""


@dataclass
class FaultRow:
    id: int
    fault_id: str
    component_type: str
    component_key: str
    node: int | None
    severity: str
    layer: str
    confidence: float
    max_confidence: float
    status: str
    started_at: float
    updated_at: float
    resolved_at: float | None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "faultId": self.fault_id,
            "componentType": self.component_type,
            "componentKey": self.component_key,
            "node": self.node,
            "severity": self.severity,
            "layer": self.layer,
            "confidence": self.confidence,
            "maxConfidence": self.max_confidence,
            "status": self.status,
            "startedAt": self.started_at,
            "updatedAt": self.updated_at,
            "resolvedAt": self.resolved_at,
        }


class FaultStore:
    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.executescript(SCHEMA)
            self._migrate(conn)

    @staticmethod
    def _migrate(conn: sqlite3.Connection) -> None:
        cols = {row[1] for row in conn.execute("PRAGMA table_info(faults)").fetchall()}
        if "layer" not in cols:
            conn.execute("ALTER TABLE faults ADD COLUMN layer TEXT NOT NULL DEFAULT 'gpu_health'")
            from app.classifier.labels import FAULT_BY_ID

            for row in conn.execute("SELECT id, fault_id FROM faults").fetchall():
                fault_def = FAULT_BY_ID.get(row["fault_id"])
                layer = fault_def.layer.value if fault_def else "gpu_health"
                conn.execute("UPDATE faults SET layer = ? WHERE id = ?", (layer, row["id"]))

    @contextmanager
    def _connect(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def get_active(self, component_key: str) -> FaultRow | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM faults WHERE component_key = ? AND status = 'active' "
                "ORDER BY started_at DESC LIMIT 1",
                (component_key,),
            ).fetchone()
            return self._row_to_dataclass(row) if row else None

    def open_fault(
        self,
        fault_id: str,
        component_type: str,
        component_key: str,
        node: int | None,
        severity: str,
        layer: str,
        confidence: float,
    ) -> FaultRow:
        now = time.time()
        with self._connect() as conn:
            cur = conn.execute(
                """INSERT INTO faults
                (fault_id, component_type, component_key, node, severity, layer,
                 confidence, max_confidence, status, started_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)""",
                (
                    fault_id,
                    component_type,
                    component_key,
                    node,
                    severity,
                    layer,
                    confidence,
                    confidence,
                    now,
                    now,
                ),
            )
            row = conn.execute("SELECT * FROM faults WHERE id = ?", (cur.lastrowid,)).fetchone()
            return self._row_to_dataclass(row)

    def update_fault(self, fault_row_id: int, confidence: float) -> None:
        now = time.time()
        with self._connect() as conn:
            conn.execute(
                "UPDATE faults SET confidence = ?, updated_at = ?, "
                "max_confidence = MAX(max_confidence, ?) WHERE id = ?",
                (confidence, now, confidence, fault_row_id),
            )

    def resolve_fault(self, fault_row_id: int) -> None:
        now = time.time()
        with self._connect() as conn:
            conn.execute(
                "UPDATE faults SET status = 'resolved', resolved_at = ?, updated_at = ? WHERE id = ?",
                (now, now, fault_row_id),
            )

    def list_faults(
        self, status: str | None = None, fault_id: str | None = None, limit: int = 200
    ) -> list[FaultRow]:
        query = "SELECT * FROM faults WHERE 1=1"
        params: list = []
        if status:
            query += " AND status = ?"
            params.append(status)
        if fault_id:
            query += " AND fault_id = ?"
            params.append(fault_id)
        query += " ORDER BY started_at DESC LIMIT ?"
        params.append(limit)
        with self._connect() as conn:
            rows = conn.execute(query, params).fetchall()
            return [self._row_to_dataclass(r) for r in rows]

    def stats(self) -> dict:
        with self._connect() as conn:
            by_fault = conn.execute(
                "SELECT fault_id, COUNT(*) as n FROM faults GROUP BY fault_id ORDER BY n DESC"
            ).fetchall()
            by_component_type = conn.execute(
                "SELECT component_type, COUNT(*) as n FROM faults GROUP BY component_type"
            ).fetchall()
            by_layer = conn.execute(
                "SELECT layer, COUNT(*) as n FROM faults GROUP BY layer ORDER BY n DESC"
            ).fetchall()
            active_count = conn.execute(
                "SELECT COUNT(*) as n FROM faults WHERE status = 'active'"
            ).fetchone()["n"]
            total_count = conn.execute("SELECT COUNT(*) as n FROM faults").fetchone()["n"]
            return {
                "byFaultId": {r["fault_id"]: r["n"] for r in by_fault},
                "byComponentType": {r["component_type"]: r["n"] for r in by_component_type},
                "byLayer": {r["layer"]: r["n"] for r in by_layer},
                "activeCount": active_count,
                "totalCount": total_count,
            }

    @staticmethod
    def _row_to_dataclass(row: sqlite3.Row) -> FaultRow:
        keys = row.keys()
        layer = row["layer"] if "layer" in keys else "gpu_health"
        return FaultRow(
            id=row["id"],
            fault_id=row["fault_id"],
            component_type=row["component_type"],
            component_key=row["component_key"],
            node=row["node"],
            severity=row["severity"],
            layer=layer,
            confidence=row["confidence"],
            max_confidence=row["max_confidence"],
            status=row["status"],
            started_at=row["started_at"],
            updated_at=row["updated_at"],
            resolved_at=row["resolved_at"],
        )
