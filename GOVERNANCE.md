### Undici Working Group

The Node.js Undici project is governed by a Working Group (WG)
that is responsible for high-level guidance of the project.

The WG has final authority over this project including:

* Technical direction
* Project governance and process (including this policy)
* Contribution policy
* GitHub repository hosting
* Maintaining the list of additional Collaborators

Undici follows the
[Node.js Code of Conduct](./CODE_OF_CONDUCT.md). Code of Conduct
matters are handled by the Node.js project according to its
[Moderation Policy](https://github.com/nodejs/admin/blob/main/Moderation-Policy.md)
and are not decided by the WG.

For the current list of WG members, see the project
[README.md](./README.md#collaborators).

### Collaborators

The undici GitHub repository is
maintained by the WG and additional Collaborators who are added by the
WG on an ongoing basis.

Individuals making significant and valuable contributions are made
Collaborators and given commit-access to the project. These
individuals are identified by the WG and their addition as
Collaborators follows the process described in _Collaborator
Nominations_ below.

_Note:_ If you make a significant contribution and are not considered
for commit-access, open an issue or contact a WG member directly and it
will be brought to the attention of the WG.

Modifications of the contents of the undici repository are
made on
a collaborative basis. Anybody with a GitHub account may propose a
modification via pull request and it will be considered by the project
Collaborators. All pull requests must be reviewed and accepted by a
Collaborator with sufficient expertise who is able to take full
responsibility for the change. In the case of pull requests proposed
by an existing Collaborator, an additional Collaborator is required
for sign-off. Consensus should be sought if additional Collaborators
participate and there is disagreement around a particular
modification. See _Consensus Seeking Process_ below for further detail
on the consensus model used for governance.

Collaborators may opt to elevate significant or controversial
modifications, or modifications that have not found consensus, to the
WG by mentioning `@nodejs/undici` in the pull request or issue. The WG
should serve as the final arbiter where required.

For the current list of Collaborators, see the project
[README.md](./README.md#collaborators). The list should be in
alphabetical order.

### Collaborator Nominations

Any Collaborator can nominate someone to become a Collaborator by
opening an issue in the undici repository that summarizes the nominee's
contributions and mentions `@nodejs/undici`. It is strongly recommended
to privately check with the nominee beforehand that they are
comfortable with the nomination.

The nomination is accepted if, after at least 7 days, a quorum of WG
members has participated, at least two WG members have approved, and
no WG member has objected. Any objection should be discussed in the
issue and, if it cannot be resolved, the nomination is decided
following the _Voting_ process below.

### WG Membership

WG seats are not time-limited.  There is no fixed size of the WG.
However, the expected target is between 6 and 12, to ensure adequate
coverage of important areas of expertise, balanced with the ability to
make decisions efficiently.

There is no specific set of requirements or qualifications for WG
membership beyond these rules.

The WG may add additional members to the WG, and a WG member may be
removed from the WG, following the process below. A WG member may also
leave the WG by voluntary resignation at any time.

Changes to WG membership are proposed by opening an issue or a pull
request against the WG member list that mentions `@nodejs/undici`. The
proposal must remain open for at least 7 days so that every WG member
has the opportunity to participate. The proposal is accepted if, at
the end of that period, a quorum of WG members has participated, at
least two WG members have approved, and no WG member has objected. If
there is an objection that cannot be resolved, the change is decided
following the _Voting_ process below. The member being removed, in the
case of a removal, does not take part in the decision and is not
counted towards the quorum.

No more than 1/3 of the WG members may be affiliated with the same
employer.  If removal or resignation of a WG member, or a change of
employment by a WG member, creates a situation where more than 1/3 of
the WG membership shares an employer, then the situation must be
immediately remedied by the resignation or removal of one or more WG
members affiliated with the over-represented employer(s).

### Decision Making

The WG may hold meetings when useful, but all decisions should be
taken by quorum and asynchronously whenever possible, in issues and
pull requests of the undici repository, so that every WG member can
participate regardless of their time zone or availability.

A quorum is reached when more than half of the WG members have
participated in a decision, by approving, objecting, voting, or
explicitly abstaining.

Items that should be brought to the attention of the WG are those that
are considered contentious or are modifications of governance,
contribution policy, WG membership, or release process.

The intention of this process is not to approve or review all patches;
that should happen continuously on GitHub and be handled by the larger
group of Collaborators.

Any community member or contributor can ask the WG for a decision by
opening a GitHub issue. Any Collaborator or WG member can bring an
issue or pull request to the WG by mentioning `@nodejs/undici`.

Unless stated otherwise in this document, a proposal brought to the WG
is accepted if, after at least 72 hours, a quorum of WG members has
participated, at least two WG members have approved, and no WG member
has objected. Changes to this governance document must remain open for
at least 7 days.

The WG may invite persons or representatives from certain projects to
participate in the discussion in a non-voting capacity.

Matters that cannot be discussed in public, such as security issues,
are handled privately among WG members in the
[OpenJS Foundation Slack](https://slack-invite.openjsf.org/) or via
email. The outcome of such decisions should be made public when
appropriate.

### Consensus Seeking Process

The WG follows a
[Consensus
Seeking](http://en.wikipedia.org/wiki/Consensus-seeking_decision-making)
decision-making model.

When a discussion has appeared to reach a consensus, any WG member
may ask "Does anyone object?" as a final call for dissent from the
consensus. If no WG member objects within 72 hours, consensus is
considered reached.

### Voting

If a proposal cannot reach a consensus, any WG member can call for a
vote. The call for a vote must be seconded by another WG member.

Votes are held asynchronously, either in a dedicated GitHub issue or
with a tool agreed upon by the WG (such as `git node vote` from
[node-core-utils](https://github.com/nodejs/node-core-utils), which
supports secret ballots). The issue must mention `@nodejs/undici` and
clearly state the options being voted on and the closing date.

* A vote remains open for at least 7 days, or until all WG members
  have cast their vote, whichever comes first.
* WG members may vote for an option or abstain.
* A vote is valid only if a quorum of WG members has participated.
* The option supported by a simple majority of the votes cast
  (excluding abstentions) wins. If no option reaches that majority, or
  the quorum is not reached, the proposal is rejected and the current
  state is kept.
* The member who called for the vote is responsible for publishing
  the result in the issue once the vote is closed.
