insert into public.sourcebooks (code, name, system, kind)
values
  ('phb-2014', 'Player Handbook (2014)', 'dnd5e-2014', 'official'),
  ('xgte', 'Xanathar''s Guide to Everything', 'dnd5e-2014', 'official'),
  ('tcoe', 'Tasha''s Cauldron of Everything', 'dnd5e-2014', 'official')
on conflict (code) do update set
  name = excluded.name,
  system = excluded.system,
  kind = excluded.kind;

insert into public.spells (slug, name, level, classes, description, source, sourcebook_code, system)
values
  ('bless', 'Bless', 1, array['cleric', 'paladin'], 'Add 1d4 to attacks and saving throws.', 'manual', 'phb-2014', 'dnd5e-2014'),
  ('cure-wounds', 'Cure Wounds', 1, array['bard', 'cleric', 'druid', 'paladin', 'ranger'], 'Touch creature regains hit points.', 'manual', 'phb-2014', 'dnd5e-2014'),
  ('shield-of-faith', 'Shield of Faith', 1, array['cleric', 'paladin'], 'Grants +2 AC while concentration lasts.', 'manual', 'phb-2014', 'dnd5e-2014'),
  ('hunter-mark', 'Hunter''s Mark', 1, array['ranger'], 'Mark target and deal extra damage.', 'manual', 'phb-2014', 'dnd5e-2014'),
  ('magic-missile', 'Magic Missile', 1, array['sorcerer', 'wizard'], 'Three darts of force automatically hit.', 'manual', 'phb-2014', 'dnd5e-2014'),
  ('fireball', 'Fireball', 3, array['sorcerer', 'wizard'], '20-foot radius fire explosion.', 'manual', 'phb-2014', 'dnd5e-2014'),
  ('revivify', 'Revivify', 3, array['cleric', 'paladin'], 'Return creature to life within one minute.', 'manual', 'phb-2014', 'dnd5e-2014'),
  ('counterspell', 'Counterspell', 3, array['sorcerer', 'warlock', 'wizard'], 'Interrupt creature casting a spell.', 'manual', 'phb-2014', 'dnd5e-2014'),
  ('spirit-guardians', 'Spirit Guardians', 3, array['cleric'], 'Spirits protect and damage enemies nearby.', 'manual', 'phb-2014', 'dnd5e-2014'),
  ('eldritch-blast', 'Eldritch Blast', 0, array['warlock'], 'Beam of crackling energy.', 'manual', 'phb-2014', 'dnd5e-2014')
on conflict (slug) do update set
  name = excluded.name,
  level = excluded.level,
  classes = excluded.classes,
  description = excluded.description,
  source = excluded.source,
  sourcebook_code = excluded.sourcebook_code,
  system = excluded.system;
