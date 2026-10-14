"""Build the SAGE incident library by running real incidents through the plant. Usage: python -m shadow.build_dataset 400"""
import sys, time
from plant import core, run_plant
from compiler import discover, oir, semantics
from fabric import emit
from shadow import sage

def main(n):
    from fabric import gateway
    gateway.TOOLS['opcua_read']['run'] = lambda gw, a: {'LastResult': 'ACK'}  # same call count, no network round trip: the dataset only needs outcomes
    core.reset_plant(14)
    run_plant.start_all()
    evs, _ = discover.discover_all(f"http://127.0.0.1:{core.PORT+1}", f"opc.tcp://127.0.0.1:{core.PORT}/tolerance/plant", "plant/functions", core.STORE, core.TRACER.path)
    b = emit.build_boundaries(oir.compile_oir(evs, semantics.make_namer()[0]))
    t = time.time()
    d = sage.build_dataset(b, n=n, vehicles=10, progress=lambda i, n: print(f"{i}/{n}", flush=True) if i % 25 == 0 else None)
    print("done", len(d), f"{time.time()-t:.0f}s")

if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 400)
