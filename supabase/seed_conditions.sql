insert into public.condition_definitions (slug, name, source, description, effect_json)
values
  ('blinded', 'Blinded', 'phb-2014', 'Cannot see and automatically fails sight checks.', '{}'),
  ('charmed', 'Charmed', 'phb-2014', 'Cannot attack the charmer and has social disadvantage.', '{}'),
  ('deafened', 'Deafened', 'phb-2014', 'Cannot hear and automatically fails hearing checks.', '{}'),
  ('frightened', 'Frightened', 'phb-2014', 'Disadvantage while source of fear is in sight.', '{}'),
  ('grappled', 'Grappled', 'phb-2014', 'Speed becomes 0.', '{"speed_multiplier":0}'),
  ('incapacitated', 'Incapacitated', 'phb-2014', 'Cannot take actions or reactions.', '{}'),
  ('invisible', 'Invisible', 'phb-2014', 'Cannot be seen without magic or special senses.', '{}'),
  ('paralyzed', 'Paralyzed', 'phb-2014', 'Incapacitated and cannot move or speak.', '{"speed_multiplier":0}'),
  ('petrified', 'Petrified', 'phb-2014', 'Creature transformed to stone.', '{"speed_multiplier":0}'),
  ('poisoned', 'Poisoned', 'phb-2014', 'Disadvantage on attack rolls and ability checks.', '{}'),
  ('prone', 'Prone', 'phb-2014', 'Only movement is to crawl unless standing up.', '{"speed_multiplier":0.5}'),
  ('restrained', 'Restrained', 'phb-2014', 'Speed 0, attacks against have advantage.', '{"speed_multiplier":0}'),
  ('stunned', 'Stunned', 'phb-2014', 'Incapacitated, cannot move, speaks falteringly.', '{"speed_multiplier":0}'),
  ('unconscious', 'Unconscious', 'phb-2014', 'Incapacitated, cannot move or speak.', '{"speed_multiplier":0}'),
  ('slow', 'Slow', 'phb-2014', 'Magic slow effect. Movement speed halved.', '{"speed_multiplier":0.5}')
on conflict (slug) do update set
  name = excluded.name,
  source = excluded.source,
  description = excluded.description,
  effect_json = excluded.effect_json;
