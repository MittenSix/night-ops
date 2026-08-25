# Account administration function

This authenticated Edge Function performs the two operations that must never be
trusted to a browser-only role check:

- delete the caller's own account;
- let an existing Night Ops lead assign `member` or `lead` to another profile.

Supabase supplies the URL, anonymous key, and service-role key to the function
runtime. The service-role key is never included in the website or repository.
