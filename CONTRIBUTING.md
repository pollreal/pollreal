# Contributing to Pollreal

Thanks for helping build a poll no AI can vote in.

## How it works

- **Issues and pull requests** live in this repository. **Ideas and open questions** live in
  [pollreal/polls Discussions](https://github.com/pollreal/polls/discussions).
- The maintainer reviews every pull request. Accepted changes are deployed to [pollreal.com](https://pollreal.com),
  usually within a few days, and the release note credits you by GitHub handle.
- Small, focused pull requests are reviewed fastest. For anything large (a new rule, a schema change, a new
  dependency), open an issue first so we can agree on the approach.

## Before you open a pull request

```
npm install
npm run db:migrate:local
npm run typecheck
npm test
npm run dev    # in one terminal
npm run smoke  # in another — required for changes to sign-up, voting, results or the database
```

- Add or update a unit test in `test/` for any rule you change.
- A schema change is a new file in `migrations/` with the next number. Never edit an applied migration's SQL.
- Interface text goes in `src/i18n.ts` (English and Korean) and `src/locales/*.ts`. Every key is type-checked against
  English; an English placeholder in another language is fine — say so in the pull request.
- No new third-party scripts, trackers or fonts in pages. No personal data beyond what the site already keeps.

## Ground rules the code must keep

1. Only verified members vote, and results are shown only as totals. No individual vote is ever visible.
2. Results and rankings never depend on money. Ads or partnerships, if any, never touch counting.
3. Product information comes from the maker's official pages, summarized as facts with a link to the source, and is
   marked as an AI summary.
4. Collect as little personal data as possible.
5. Abuse thresholds stay configurable: the public code keeps defaults, and production may override them privately.
   Pull requests that change a rule's **logic** are welcome. Please do not post the production values you infer.

## Security issues

Do not open a public issue for a way to cast fake votes or reach someone's data. See [SECURITY.md](SECURITY.md).

## License of contributions

By submitting a pull request you agree that your contribution is licensed under the
[GNU AGPL-3.0](LICENSE), the same license as the project.
