"""Start the plant's real interfaces: the ERP over HTTP and the OPC UA server."""
import threading, time, uvicorn
from . import opcua_server
from .erp_app import app

from .core import PORT
ERP_PORT = PORT + 1


def start_all():
    opcua_server.start()
    cfg = uvicorn.Config(app, host="127.0.0.1", port=ERP_PORT, log_level="warning")
    srv = uvicorn.Server(cfg)
    threading.Thread(target=srv.run, daemon=True).start()
    while not srv.started:
        time.sleep(.05)
    return srv


if __name__ == "__main__":
    start_all()
    print("plant interfaces up: erp http://127.0.0.1:%d  opcua %s" % (ERP_PORT, opcua_server.ENDPOINT))
    while True:
        time.sleep(3600)
