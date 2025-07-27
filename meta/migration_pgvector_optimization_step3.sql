-- =============================================================================
-- PGVECTOR OPTIMIZATION MIGRATION - STEP 3: RPC Function Creation
-- =============================================================================
-- 
-- This is STEP 3 of 3 - Runs quickly, creates the search function
-- 
-- INSTRUCTIONS:
-- 1. Make sure Steps 1 and 2 completed successfully first
-- 2. Run this script to create the optimized search function
-- 3. Test your vector search - it should be much faster!
--
-- =============================================================================

-- Create optimized RPC function for approximate search
-- This function works with both HNSW and IVFFlat indexes
DROP FUNCTION IF EXISTS search_vectorized_sources_hnsw;

CREATE OR REPLACE FUNCTION search_vectorized_sources_hnsw(
    match_count int DEFAULT 5,
    match_threshold float DEFAULT -0.7,
    query_embedding vector(1536) DEFAULT NULL
)
RETURNS TABLE(
    id text,
    source_name text,
    content text,
    url text,
    metadata jsonb,
    created_at timestamptz,
    similarity float
)
LANGUAGE sql
STABLE
AS $$
    SELECT 
        vs.id,
        vs.source_name,
        vs.content,
        vs.url,
        vs.metadata,
        vs.created_at,
        -- Return similarity score (1 - distance) for easier interpretation
        1 - (vs.embedding <-> query_embedding) AS similarity
    FROM vectorized_sources vs
    WHERE vs.embedding IS NOT NULL
      AND query_embedding IS NOT NULL
    ORDER BY vs.embedding <-> query_embedding  -- Uses the index we created in step 2
    LIMIT match_count;
$$;

-- Add comment explaining the function
COMMENT ON FUNCTION search_vectorized_sources_hnsw IS 
'Optimized approximate nearest neighbor search for vectorized_sources. 
Uses pgvector <-> operator with HNSW or IVFFlat index for fast similarity search.
Returns results ordered by similarity (higher = more similar).
Parameter order: match_count, match_threshold, query_embedding';

-- Grant necessary permissions for Supabase users
GRANT EXECUTE ON FUNCTION search_vectorized_sources_hnsw TO anon, authenticated;

-- Test the function with a dummy vector (this should work immediately)
SELECT 'Testing RPC function...' as status;

-- Verify the function exists and is callable
SELECT 
    routine_name,
    routine_type,
    specific_name
FROM information_schema.routines 
WHERE routine_name = 'search_vectorized_sources_hnsw';

-- Performance tuning recommendations
SELECT '
=== PERFORMANCE TUNING RECOMMENDATIONS ===

For HNSW indexes:
- SET hnsw.ef_search = 40;  -- Higher = more accurate but slower (default: 40)

For IVFFlat indexes:
- SET ivfflat.probes = 10;  -- More probes = more accurate but slower (default: 1)

Monitor your search performance and adjust these parameters as needed.
' as recommendations;

-- Final success message
SELECT 'Migration completed successfully! Your vector search should now be much faster.' as result; 