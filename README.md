# Mapping an audit practice, end to end

A solo business process analysis project for an audit department. It covers role-based interviews, a full swimlane map across three business units, pain points measured against the department's own job data, and a solution proposal for Phase 1 of an automation programme.

| | |
|---|---|
| **Case study** | https://audit-workflow-case-study.pages.dev/ |
| **Demo explorer** | https://audit-workflow-case-study.pages.dev/demo/ (fictional firm) |
| **Video walkthrough (1:30)** | On the case study page, or [site/media/walkthrough.mp4](site/media/walkthrough.mp4) |

## Results

- **Mapped:** 16 workflow pages, 394 steps, 85 decisions and 124 hand-offs between departments, from interviews across 7 roles.
- **Problems found:** 118 pain points logged, each traced to a source, and tested against about 2,500 job records.
- **Key finding:** fieldwork takes a median of 6 days, while the whole job takes 80. 40% of jobs start before the fee is agreed.
- **Proposal:** 5 root causes behind 9 problems, with a suggested order of work for Phase 1.

## What's in this repository

```
site/                 The public website (what the links above show)
├── index.html        The case study page
├── media/            The 1:30 narrated walkthrough video and its cover image
└── demo/             The process explorer, built from a fictional sample firm

tooling/              The code behind the project
├── explorer/         Turns draw.io swimlane drawings into the clickable explorer website
├── examples/         The fictional sample drawings the demo is built from
├── transcription/    Cross-checks interview transcripts from two speech-to-text models
├── analysis/         Charts for the problem analysis (priority matrix, 5 Whys, fishbones)
└── README.md         How the tools work and how to run them
```

## How the project ran

1. **Interviews:** I held recorded sessions and walkthroughs with each role, from Senior Manager to Preparer.
2. **Transcripts:** every recording was transcribed by two models, Whisper and Qwen3-ASR (`tooling/transcription/`). Where the two disagreed, the passage was listened to again instead of guessed.
3. **Swimlanes:** I drew one page per process, with lanes by department and job title and one action per box. Manager review comments were tracked on the drawings.
4. **Evidence:** I measured each pain point against the department's job logs, fee records and time reports. Only counts were used, and no client data was copied.
5. **Explorer:** a Python build (`tooling/explorer/`) turns the drawings into a website. Managers can click any step, follow a job across teams, and see every page that uses a given file or system.
6. **Solution proposal:** root causes, first fixes and the order of work.

## Confidentiality

Published with my manager's agreement, in anonymised form. The firm, its people, its clients and its internal systems are not named. The demo uses an invented firm. This repository holds no recordings, transcripts, spreadsheets, internal documents or real drawings.

Built with the help of an AI coding assistant (Claude). The interviews, analysis and decisions are my own.
