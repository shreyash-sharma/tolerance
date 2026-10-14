"""ERP mock with a real OpenAPI document (served at /openapi.json)."""
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from .core import ERPX

app = FastAPI(title="Synthetic ERP", version="1.0.0", description="Manufacturing orders and vehicle genealogy. Synthetic.")


class Genealogy(BaseModel):
    vin: str
    pcbSerialNo: str
    firmwareVersion: str
    bmsId: str
    packSerialNo: str


@app.get("/manufacturing-orders", tags=["orders"])
def list_orders():
    return ERPX.orders()


@app.get("/manufacturing-orders/{mo}", tags=["orders"])
def get_order(mo: str):
    o = ERPX.order(mo)
    if not o:
        raise HTTPException(404, "unknown order")
    return o


@app.post("/manufacturing-orders/{mo}/genealogy", tags=["genealogy"])
def attach(mo: str, g: Genealogy):
    try:
        return ERPX.attach_genealogy(mo, g.model_dump())
    except KeyError:
        raise HTTPException(404, "unknown order")
