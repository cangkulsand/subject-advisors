# Project execution

- Delegate execution of project tasks to `gpt-6-luna`; the coordinating agent may inspect, plan, coordinate, review, and report. Follow the global rule if Luna is unavailable or unsuitable, or if the user gives a task-specific model override.
- After each Luna mini-task, the coordinator must review the actual diff for scope, correctness, compatibility, and relevant verification evidence. Return issues to Luna to fix and review again; do not mark the mini-task complete or start dependent work before review passes.
- This instruction assigns task execution only. It does not change the user's selected main model.
- When coordinating through a model override, explicitly pass the task scope and necessary context; use `fork_turns="none"` when applicable.
- Keep each task within the user's selected scope and follow `docs/implementationguide.md`.
