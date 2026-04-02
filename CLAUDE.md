# Kavita Fork - Development Guidelines

## Repository Structure

This is a **fork** of [Kareadita/Kavita](https://github.com/Kareadita/Kavita).

- **origin**: `danielsiwiec/Kavita` (this fork)
- **upstream**: `Kareadita/Kavita` (original project)

## Branching Strategy

Keep commits minimal and focused to reduce merge conflicts with upstream. The goal is to maintain a small diff that can be easily rebased.

### Before Making Changes

```bash
# Fetch latest from upstream
git fetch upstream develop

# Rebase your branch on upstream/develop
git rebase upstream/develop
```

### After Making Changes

```bash
# Always rebase (not merge) to keep history clean
git fetch upstream develop
git rebase upstream/develop

# Force push after rebase
git push origin <branch> --force
```

### Building the Docker Image

**Always build the Docker image at the end of the rebasing process** to verify the merge compiles cleanly (both the Angular UI and the .NET API):

```bash
make build
```

This runs `docker build -f Dockerfile.dev -t kavita:dans`. If upstream adds or renames a .NET project, update the per-project `COPY *.csproj` lines in `Dockerfile.dev` so they match `Kavita.sln`, otherwise `dotnet restore` will fail.

### Swapping the Running Instance

**Once the image is built, swap the running instance** so it picks up the new build. Kavita runs as the `kavita` service in the `arr` compose stack:

```bash
cd /Users/dansiwiec/workspace/arr
docker compose up -d kavita
```

The `image: kavita:dans` tag is unchanged but now resolves to a new image ID, so Compose recreates the container. Reading data is preserved (it lives in the `kavita/config` bind-mount, not the container). The only effect is a brief restart of the live instance (served on port `45000`). Verify with `docker ps --filter name=kavita` that it comes up `healthy`.

## Commit Guidelines

1. **Keep commits atomic** - One feature/fix per commit
2. **Avoid modifying upstream files unnecessarily** - Only change what's needed for your feature
3. **Don't sync entire directories** - Cherry-pick specific changes to avoid overwriting upstream updates
4. **Check for upstream changes** before committing files that might have been updated upstream

## Common Pitfalls

### Entity/Migration Mismatches

When copying code from another local repo, be careful with:
- `API/Entities/` - Entity definitions must match migrations
- `API/Data/Migrations/` - Don't overwrite with older versions
- `DataContextModelSnapshot.cs` - Must be consistent with entity definitions

Always verify after syncing:
```bash
git diff upstream/develop -- API/Entities/
git diff upstream/develop -- API/Data/Migrations/DataContextModelSnapshot.cs
```

### Resolving Conflicts

When rebasing causes conflicts:
1. **Language files** (`*.json` in `assets/langs/`) - Take upstream version
2. **openapi.json** - Take upstream version
3. **Your feature files** - Merge carefully, keeping your changes
4. **Entity/Migration files** - Prefer upstream unless you have specific schema changes

## Local Development Files

These files are specific to this fork and not in upstream:
- `Dockerfile.dev` - Local development Dockerfile
- `Makefile` - Build helper

## Useful Commands

```bash
# Check what's different from upstream
git diff upstream/develop --stat

# See commits ahead of upstream
git log upstream/develop..HEAD --oneline

# Interactive rebase to clean up commits before pushing
git rebase -i upstream/develop
```

---

## Fork Features

This section documents custom features implemented in this fork. Use this as reference during rebases to ensure features are preserved correctly.

### Documentation Guidelines for AI Agents

When implementing or modifying fork features, always update this section with:

1. **Purpose**: Why the feature exists and what problem it solves
2. **Files Modified**: All files touched, with paths relative to repo root
3. **Key Implementation Details**: Important code patterns, gotchas, and design decisions
4. **Code Snippets**: Include relevant snippets that capture the essence of the implementation
5. **Why Not Alternatives**: Document approaches that were tried and failed, so future agents don't repeat mistakes
6. **Dependencies**: Any external libraries or upstream features this depends on

