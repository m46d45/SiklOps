"""
Modul 1 — Informasi Operasi (v1.0: Earthmoving saja)

Metadata edukatif untuk operasi galian & angkut.
"""

from __future__ import annotations

from dataclasses import dataclass

from .simulation_engine import OperationType


@dataclass(frozen=True)
class OperationInfo:
    op_type: OperationType
    title: str
    description: str
    loader_label: str
    hauler_label: str
    unit: str


# v1.0: hanya Earthmoving
EARTHMOVING_INFO = OperationInfo(
    op_type=OperationType.EARTHMOVING,
    title="Earthmoving (Galian & Angkut)",
    description=(
        "Excavator menggali/memuat material ke dump truck di area cut, "
        "truck mengangkut ke spoil/disposal area, membongkar (dump), "
        "lalu kembali ke area galian untuk dimuat lagi."
    ),
    loader_label="Excavator",
    hauler_label="Dump Truck",
    unit="m³",
)


def get_operation(op: OperationType | None = None) -> OperationInfo:
    """v1.0 selalu mengembalikan info Earthmoving."""
    return EARTHMOVING_INFO


def list_operations() -> list[OperationInfo]:
    """Kompatibilitas: daftar operasi (hanya Earthmoving)."""
    return [EARTHMOVING_INFO]
