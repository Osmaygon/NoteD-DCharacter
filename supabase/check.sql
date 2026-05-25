select 'profiles' as table_name, count(*) as total from public.profiles
union all
select 'campaigns', count(*) from public.campaigns
union all
select 'campaign_members', count(*) from public.campaign_members
union all
select 'characters', count(*) from public.characters
union all
select 'character_currency', count(*) from public.character_currency
union all
select 'inventory_items', count(*) from public.inventory_items
union all
select 'condition_definitions', count(*) from public.condition_definitions
union all
select 'character_conditions', count(*) from public.character_conditions
union all
select 'character_actions', count(*) from public.character_actions
union all
select 'spells', count(*) from public.spells
union all
select 'dice_rolls', count(*) from public.dice_rolls
union all
select 'session_logs', count(*) from public.session_logs;
