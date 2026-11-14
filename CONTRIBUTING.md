# Contributing to ProofBench

Thanks for helping. This guide covers who owns what, how changes land on `main`, and what to run first.

## 👥 Who owns what

| Area | Owner | Reviews needed |
|:--|:--|:--|
| Product, frontend, Graph Repair | **Aryan Vishwakarma** (team lead) | Aryan decides frontend architecture and components within stable API boundaries |
| Architecture, AI systems, execution, integration | **Farhan Akhtar** | Execution and safety changes need Farhan |
| Verification semantics (Tavily) | **Mohit** | Mohit's review plus Khushi's evaluation evidence |
| Evaluation, fixtures, accuracy rubric | **Khushi Yadav** | Khushi |
| Contracts (`packages/contracts`) | Farhan + Aryan | Both, together |

Repository ownership doesn't change team leadership. GitHub handles still missing are tracked in [`docs/TEAM.md`](docs/TEAM.md); until then, name owners in the issue body.

## 🌿 Branches and pull requests

- Start from `main` and use short-lived branches named for the work: `feat/ui-dashboard`, `feat/tavily-verifier`, `fix/present-scroll`, `docs/judging-demo`.
- Open focused pull requests with linked issues, reproducible validation and stated limitations.
- No direct pushes to `main`, no force pushes, no history rewrites.
- Don't block frontend, evaluation or Tavily work on live experiments: use the offline fixtures and the stable interface.

`main` is protected. A pull request merges only when it has **one approving review**, the **`validate`** and **`native-boundary`** checks pass, and all conversations are resolved. A new push dismisses earlier approvals, so re-request review after changes.

## ✅ Before you open a pull request

```bash
npm run check            # lint, typecheck, unit tests, fixture regressions, build
npm run test:contracts   # cross-package schema contracts
npm run test:ui          # Playwright browser tests, desktop and mobile
```

Run the Cargo checks too if you touched native code. CI never needs paid API access.

`CODEOWNERS` documents intent, but invitees who haven't accepted can't act as code owners. Actual repository settings are recorded in [`docs/REPOSITORY-STATUS.md`](docs/REPOSITORY-STATUS.md).
