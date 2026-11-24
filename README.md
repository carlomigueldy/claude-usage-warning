# claude-usage-warning

A Claude Code mod that warns you before you run out of plan usage. When your
weekly (7-day) or 5-hour usage reaches 80%, a band appears above the prompt
showing how much is used and when each limit resets:

```
⚠ 7d 82% · resets Sat 6:00pm SGT (4d 1h)  |  5h 91% · resets 7:30pm SGT (2h50m)    /usage-ack to hide
```

- Yellow from 80%, red at 95% and above.
- Shows in every session while you are over 80%.
- `/usage-ack` hides it until the next step (90%, then 95%) or until that limit resets. The hide is remembered across sessions.
- Reset times are shown in your local time, labelled with your time zone's short name or UTC offset (e.g. `UTC+8`).

Requires a Claude subscription plan that reports usage limits.

## Options

**Time zone label** (`zoneLabel`): text shown after reset times, such as `SGT`. Leave it empty to use the automatic label. Set it in the plugin's options in `/config`.

## License

MIT

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install usage-warning --marketplace carlomigueldy/claude-usage-warning
```

Answer `y` to add the marketplace, then press Enter to pick the user scope.

From a shell:

```
claude plugin install usage-warning --marketplace carlomigueldy/claude-usage-warning
```

In the Claude desktop app: click + next to the prompt box, then Plugins, Add marketplace with `carlomigueldy/claude-usage-warning`, then Add plugin.
