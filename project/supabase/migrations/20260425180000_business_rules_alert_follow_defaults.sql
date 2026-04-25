-- アラート・フォロー日数帯（未設定時はアプリ既定の 30/60/90）
INSERT INTO public.business_rules (rule_key, rule_value, description)
SELECT 'alert_active_max_exclusive', '30', 'アラート: 最終来院の経過日数が未満なら「アクティブ」'
WHERE NOT EXISTS (SELECT 1 FROM public.business_rules WHERE rule_key = 'alert_active_max_exclusive');

INSERT INTO public.business_rules (rule_key, rule_value, description)
SELECT 'alert_tier1_end', '60', 'アラート: 2番目の帯の上端日数'
WHERE NOT EXISTS (SELECT 1 FROM public.business_rules WHERE rule_key = 'alert_tier1_end');

INSERT INTO public.business_rules (rule_key, rule_value, description)
SELECT 'alert_tier2_end', '90', 'アラート: 3番目の帯の上端日数'
WHERE NOT EXISTS (SELECT 1 FROM public.business_rules WHERE rule_key = 'alert_tier2_end');
