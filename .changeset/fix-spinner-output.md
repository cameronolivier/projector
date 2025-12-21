---
"projector": patch
---

Fix invisible output in `projector ignore` by using spinner.succeed() instead of stop() to ensure terminal output is properly displayed.
