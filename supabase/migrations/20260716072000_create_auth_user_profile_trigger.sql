-- Ensure every authenticated user has a public profile row.
-- The initial schema defines public.handle_new_user() but left the auth.users
-- trigger as a manual follow-up, which breaks fresh cloud deployments.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.profiles (id, email, full_name, avatar_url)
SELECT
    users.id,
    users.email,
    users.raw_user_meta_data->>'full_name',
    users.raw_user_meta_data->>'avatar_url'
FROM auth.users AS users
LEFT JOIN public.profiles AS profiles
    ON profiles.id = users.id
WHERE profiles.id IS NULL;
