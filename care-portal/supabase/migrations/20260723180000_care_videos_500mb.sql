-- care-videos バケットの上限を 500MB に揃える
-- （「The object exceeded the maximum allowed size」対策）
UPDATE storage.buckets
SET file_size_limit = 524288000 -- 500 MiB
WHERE id = 'care-videos';
