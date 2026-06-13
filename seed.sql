-- ===========================================================
-- Données d'exemple pour l'agenda (à remplacer par les vrais événements)
-- ===========================================================
DELETE FROM events;
INSERT INTO events (title, cat, tone, free, "when", descr, starts_at, published) VALUES
('Café-tricot',      'Atelier',   'ocre',    1, 'JEU. 18 JUIN · 15H',    'Aiguilles, laine et bavardages. Débutants bienvenus, on apprend ensemble.',          '2026-06-18T15:00', 1),
('Repas de rue',     'Événement', 'brique',  0, 'SAM. 27 JUIN · 19H',    'Chacun apporte un plat, on installe les grandes tables place de Montety.',           '2026-06-27T19:00', 1),
('Aide aux devoirs', 'Entraide',  'olive',   1, 'TOUS LES MAR. · 17H',   'Les retraités du quartier accompagnent les écoliers, dans la bonne humeur.',         '2026-06-23T17:00', 1),
('Balade contée',    'Sortie',    'ardoise', 1, 'DIM. 5 JUIL. · 10H',    'Sur les pas de Paulin de Montety : histoires et mémoires du quartier.',              '2026-07-05T10:00', 1),
('Atelier jardinage','Atelier',   'olive',   0, 'SAM. 11 JUIL. · 10H',   'On plante les bacs partagés du bas de la rue. Outils fournis.',                      '2026-07-11T10:00', 1),
('Loto de quartier', 'Événement', 'brique',  0, 'VEN. 17 JUIL. · 20H30', 'La soirée préférée des anciens comme des petits. Lots offerts par les commerçants.', '2026-07-17T20:30', 1);
