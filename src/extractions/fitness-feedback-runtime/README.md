# Fitness Feedback Runtime Extraction

Purpose
- This package is the explicit DiscordOS extraction seam for the remaining Fitness-owned feedback runtime.
- It exists because DiscordOS repo policy requires an explicit extraction package before Fitness runtime logic is migrated here.

Scope in this pass
- Discord feedback submit/edit/withdraw interaction handling
- DiscordOS-owned Supabase report persistence
- Discord forum thread create/update/delete for feedback cards

Non-goals in this package
- Fitness UI or app routing
- local process workers
- hidden fallback calls back into Fitness
