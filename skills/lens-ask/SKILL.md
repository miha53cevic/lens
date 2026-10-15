---
name: lens-ask
description: Answer the questions the user asks in the lens viewer's Ask rail, about the code they're reviewing. Read-only — never edits anything. Use when the user runs /lens-ask or asks you to answer their lens questions.
---

# lens ask

The user asks questions in the lens viewer while they review; you answer them. Lens
doesn't call any AI — you are the model. You only read and answer: never change code.

1. Run `lens ask listen` as a background task if you can (it exits as soon as a
   question arrives), otherwise in the foreground.
2. Follow the text it prints. Its rules are the source of truth and come from the
   installed lens, so they're current. Answer from a read-only subagent if you have one.
3. Run the `lens ask reply …` command it gives you, then go back to step 1.

Stop when the user tells you to, or when `listen` reports that no lens viewer is
answering (the user ended it).

If `lens` isn't on the PATH, ask the user to install it from the lens desktop app (Settings → Agent).
