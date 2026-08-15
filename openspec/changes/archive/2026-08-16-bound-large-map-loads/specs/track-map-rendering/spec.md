## ADDED Requirements

### Requirement: Attachment reads are bounded per refresh

A refresh SHALL limit how many attachment reads it has outstanding at one time,
so that peak concurrent reads follow a fixed limit rather than the size of the
base result. The limit SHALL NOT change which files are read, SHALL NOT alter
read de-duplication, and SHALL NOT let an older refresh commit over a newer one:
a superseded or detached refresh SHALL stop starting further reads.

#### Scenario: A base result contains far more attachments than the limit

- **WHEN** a map refresh needs to read thousands of attachments that are not yet cached
- **THEN** no more than the fixed limit are read at once, every one of them is still read, and the drawn result is the same as an unbounded refresh would produce

#### Scenario: A newer refresh supersedes one still reading

- **WHEN** data changes while a refresh is partway through its bounded reads
- **THEN** the superseded refresh stops starting new reads and does not commit, and the newer refresh's result is what reaches the map

#### Scenario: Two refreshes want the same uncached file

- **WHEN** concurrent refreshes both need a file that no cache entry covers yet
- **THEN** the file is read once and shared, as it is today, rather than once per refresh
