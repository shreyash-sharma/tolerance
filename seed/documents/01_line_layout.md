# SDU Smart Production Lab - Line 1 layout (rev C)

Owner: Production engineering. Status: released.

## Stations
Line 1 has the following stations. Material moves left to right.

- WH1 - Warehouse 1, input rack. Holds raw carriers. Feeds conveyor C1.
- C1 - Conveyor 1. Takes carriers from WH1 to the transfer robot.
- TR - Transfer robot (6-axis arm). Moves carriers from C1 to C2.
- C2 - Conveyor 2. Takes carriers from the transfer robot to WH2.
- WH2 - Warehouse 2, output rack. Receives finished carriers from C2.
- AGV - Automated guided vehicle. Moves full carriers between WH2 and WH1 on the outer aisle.

## Planned extension
C3 - Overflow conveyor, installed 2021-05-18 between C1 and the transfer robot. It buffers up to 6 carriers when TR is stopped. C3 has its own drive and its own controller.

## Flows
WH1 feeds C1. C1 feeds TR. TR feeds C2. C2 feeds WH2. AGV serves WH1 and WH2.
