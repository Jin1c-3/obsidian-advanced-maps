## ADDED Requirements

### Requirement: Tracked source carries no invisible bytes

The repository's checks SHALL reject a tracked text file containing a C0 control
character other than tab and newline, a DEL character, a bidirectional
formatting override, a zero-width space, or a byte-order mark, and SHALL reject a
tracked file that is neither a declared binary asset nor decodable as UTF-8.
The check SHALL run both from the repository's local check command and as its own
continuous-integration step.

#### Scenario: A control character reaches a source file

- **WHEN** a tracked text file gains a NUL, a carriage return, or any other C0 control character that is not a tab or a newline
- **THEN** the check fails, naming the file, the line, and which character was found, before the change can merge

#### Scenario: Bidirectional or zero-width characters are introduced

- **WHEN** a tracked text file gains a bidirectional formatting override, a zero-width space, or a byte-order mark
- **THEN** the check fails and identifies it, because such a character can make reviewed source read differently from what is compiled

#### Scenario: A new binary asset is added

- **WHEN** a tracked file cannot be decoded as UTF-8 and its type is not among the repository's declared binary asset types
- **THEN** the check fails rather than skipping the file, so the new type is declared deliberately

#### Scenario: Existing binary assets are checked

- **WHEN** the check runs against the repository's declared binary assets, such as the documentation screenshots
- **THEN** they are skipped without being reported, and the check passes
