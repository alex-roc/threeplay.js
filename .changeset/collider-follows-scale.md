---
"threeplay": patch
---

The collider of a physics object now follows changes to the object's own scale (crouching with `obj.scale.y = 0.5`, growing, squashing): it is rebuilt at the new size on the next fixed step, keeping the body's pose and velocity. Before, the scale was baked in when the body was created.
