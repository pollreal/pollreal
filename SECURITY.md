# Security policy

## Reporting a problem

If you find a way to cast fake or duplicate votes, to see how an individual voted, to reach a member's data, or to
bypass sign-up, **report it privately**:

- GitHub: **Security → Report a vulnerability** on this repository (private advisory), or
- email **hello@pollreal.com** with the subject "Security".

Please include the steps to reproduce it and what you observed. Do not test against other people's accounts, do not
cast more than a handful of test votes on live polls, and do not run load tests against pollreal.com. A local copy
(`npm run dev`) reproduces nearly everything.

We will reply within 3 days, fix confirmed problems as fast as we can, and credit you in the release note unless you
prefer otherwise. There is no paid bounty yet.

## What is in scope

- pollreal.com and the code in this repository.
- Out of scope: denial-of-service, spam volume, social engineering, and reports that only state that a determined
  person with many real phones and SIM cards could vote several times — that limit is stated openly in the README.
  Ideas that make it cheaper to detect are welcome as normal issues.
