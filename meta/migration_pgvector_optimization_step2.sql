-- =============================================================================
-- PGVECTOR OPTIMIZATION MIGRATION - STEP 2: Index Creation
-- =============================================================================
-- 
-- This is STEP 2 of 3 - May take time on large datasets
-- 
-- INSTRUCTIONS:
-- 1. Run Step 1 first if you haven't already
-- 2. Choose ONE of the index creation options below based on your dataset size
-- 3. If this times out, try the "Fast HNSW" or "IVFFlat" options instead
--
-- =============================================================================

-- Check dataset size first (run this to see which option to choose)
SELECT 
    COUNT(*) as total_rows,
    COUNT(embedding) as rows_with_embeddings,
    CASE 
        WHEN COUNT(*) > 100000 THEN 'Use Option C: IVFFlat Index (fastest for large datasets)'
        WHEN COUNT(*) > 10000 THEN 'Use Option B: Fast HNSW Index (good compromise)'
        ELSE 'Use Option A: Standard HNSW Index (best quality)'
    END as recommended_option
FROM vectorized_sources;

-- =============================================================================
-- OPTION A: Standard HNSW Index (Best Quality) - Use for < 10k rows
-- =============================================================================

-- Uncomment this section if you have < 10,000 rows:
/*
DROP INDEX IF EXISTS vectorized_sources_embedding_hnsw_idx;

CREATE INDEX CONCURRENTLY vectorized_sources_embedding_hnsw_idx 
ON vectorized_sources 
USING hnsw (embedding vector_l2_ops) 
WITH (m = 16, ef_construction = 64);

SELECT 'Option A: Standard HNSW index created successfully' as result;
*/

-- =============================================================================
-- OPTION B: Fast HNSW Index (Good Compromise) - Use for 10k-100k rows  
-- =============================================================================

-- Uncomment this section if you have 10k-100k rows:

DROP INDEX IF EXISTS vectorized_sources_embedding_hnsw_idx;

-- Reduced parameters for faster building
CREATE INDEX CONCURRENTLY vectorized_sources_embedding_hnsw_idx 
ON vectorized_sources 
USING hnsw (embedding vector_l2_ops) 
WITH (m = 8, ef_construction = 32);

SELECT 'Option B: Fast HNSW index created successfully' as result;


-- =============================================================================
-- OPTION C: IVFFlat Index (Fastest for Large Datasets) - Use for > 100k rows
-- =============================================================================

-- Uncomment this section if you have > 100k rows or HNSW times out:

-- DROP INDEX IF EXISTS vectorized_sources_embedding_ivfflat_idx;

-- -- Calculate optimal number of lists (rule of thumb: sqrt(rows))
-- DO $$
-- DECLARE
--     row_count integer;
--     optimal_lists integer;
-- BEGIN
--     SELECT COUNT(*) INTO row_count FROM vectorized_sources WHERE embedding IS NOT NULL;
--     optimal_lists := GREATEST(10, LEAST(1000, sqrt(row_count)::integer));
    
--     RAISE NOTICE 'Creating IVFFlat index with % lists for % rows', optimal_lists, row_count;
    
--     EXECUTE format('
--         CREATE INDEX CONCURRENTLY vectorized_sources_embedding_ivfflat_idx 
--         ON vectorized_sources 
--         USING ivfflat (embedding vector_l2_ops) 
--         WITH (lists = %s)', optimal_lists);
-- END $$;

-- SELECT 'Option C: IVFFlat index created successfully' as result;


-- =============================================================================
-- Post-Index Creation Steps
-- =============================================================================

-- Update table statistics for query optimization
ANALYZE vectorized_sources;

-- Check the index was created successfully
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'vectorized_sources' 
AND indexname LIKE '%embedding%';

-- Step 2 completed
SELECT 'Step 2 completed successfully. Proceed to step 3 for RPC function creation.' as result; 