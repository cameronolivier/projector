---
"projector": patch
---

Fix spinner blocking inquirer in `projector ignore` command by ensuring spinner.stop() is called even when scanning fails.
