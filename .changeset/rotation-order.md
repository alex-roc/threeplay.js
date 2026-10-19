---
"threeplay": minor
---

`rotate()` gains `rotOrder` (default `"XYZ"`): set it to `"YXZ"` so `rot` reads as heading, pitch and roll, as aircraft and vehicles need. `lookAt()` now keeps the object's rotation order instead of resetting it to XYZ.
