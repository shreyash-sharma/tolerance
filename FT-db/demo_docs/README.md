# Demo documents for Tolerance

Upload all files in this folder at the "Drop your documents" step. Do not upload this README.

What each file is for:
- 01 to 08: the line layout, the SOPs, the vendor manual, the AGV notes, an order email, the shift handover and the maintenance log. They name the six stations that the sample machine data has: WH1, C1, C2, TR, AGV, WH2. So the 2D and 3D floor draws cleanly. Station C3 is named in the layout only, so it shows as a station that exists only in the documents.
- 07 contains one hidden instruction. Tolerance removes it. Point at "1 hidden order removed" in the video.
- 09 names MongoDB (two collections) and the MQTT broker, with their addresses. The Connect step asks for each one by name. Change the address in the field to the address you use (for example 127.0.0.1:27017 with an SSH tunnel).
- 10 names the reflow oven and its limit of 260 degrees Celsius. This is the hard limit for the oven scene.

Notes:
- The files contain no secrets. The password for the MongoDB user is typed in the app, not in a file.
- The MongoDB host name in 09 is a made-up name on purpose. Replace it in the address field.
