# Third-party notices

The root [MIT license](LICENSE) applies to Balaji's original source in this
repository. It does not relicense third-party dependencies, model weights,
upstream source, trademarks or externally supplied documents. Preserve any
upstream license and copyright notices when redistributing those materials.

The source ZIP contains dependency manifests and lockfiles, not installed
dependencies or model weights. Installing optional components retrieves
separately licensed software. Review the installed packages' original license
files and the complete lockfile dependency graph when distributing a bundled
application. This direct-dependency inventory is not a replacement for those
notices or a complete transitive software bill of materials.

## JavaScript dependencies

Versions and license identifiers below are recorded in the current lockfiles.
The root package, internal `quality/` module and optional Code Mode integration
have separate lockfiles.

| Component | Locked version | Upstream license |
| --- | --- | --- |
| `@playwright/test` | 1.62.1 | Apache-2.0 |
| `typescript` | 5.9.3 | Apache-2.0 |
| `@types/node` | 22.20.1 root; 22.20.4 quality | MIT |
| `yaml` | 2.9.0 root; 2.9.1 quality | ISC |
| `@modelcontextprotocol/sdk` | 1.32.2 | MIT |
| `zod` | 4.6.7 | MIT |
| `tsx` | 4.23.15 | MIT |
| `@utcp/code-mode` | 1.2.13 | MPL-2.0 |
| `@utcp/sdk` | 1.1.0 | MPL-2.0 |
| `isolated-vm` | 6.2.0 | ISC |

The optional UTCP dependencies retain their MPL-2.0 license. They are referenced
as packages, not converted to MIT by this repository's license.

## Optional Python and model runtimes

`quality/python/requirements*.txt` and `quality/python/requirements.lock`
identify optional Python dependencies. Current direct pins include Laya 0.4.12,
PyTorch 2.15.0, Transformers 5.22.1, Safetensors 0.8.0, PyYAML 6.0.3,
OpenPyXL 3.1.5, xlrd 2.0.2 and pypdf 6.21.4. These packages retain their upstream
licenses; consult their installed distributions for original notices. This
inventory does not assert that all optional runtime combinations are installed
or verified. Models and downloaded datasets are not supplied or licensed here.

## Source and fixture boundaries

Authored synthetic examples, test fixtures and curated demo captures may be
included with the original project source. Private requirements, raw provider
responses, local credentials, execution reports and unpublished article drafts
are excluded from the source ZIP. External requirements remain owned by their
original authors and are not made public by invoking the packaging command.
