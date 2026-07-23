-- 補足講義（C＋⑬⑭⑮）を上、ダイエット（B＋16〜20）を一番下へ入れ替え
WITH ordered(item_key, sort_order) AS (
  VALUES
    ('study', 10),
    ('study2', 20),
    ('greeting_A', 30),
    ('sub_1', 40),
    ('sub_2', 50),
    ('sub_3', 60),
    ('sub_4', 70),
    ('sub_5', 80),
    ('sub_6', 90),
    ('sub_7', 100),
    ('sub_8', 110),
    ('sub_9', 120),
    ('sub_10', 130),
    ('sub_11', 140),
    ('sub_12', 150),
    ('greeting_C', 160),
    ('sub_13', 170),
    ('sub_14', 180),
    ('sub_15', 190),
    ('greeting_B', 200),
    ('sub_16', 210),
    ('sub_17', 220),
    ('sub_18', 230),
    ('sub_19', 240),
    ('sub_20', 250)
)
UPDATE care_watch_layout AS w
SET
  sort_order = o.sort_order,
  updated_at = now()
FROM ordered AS o
WHERE w.item_key = o.item_key;
