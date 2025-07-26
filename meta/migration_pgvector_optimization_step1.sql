-- =============================================================================
-- PGVECTOR OPTIMIZATION MIGRATION - STEP 1: Basic Setup
-- =============================================================================
-- 
-- This is STEP 1 of 3 - runs quickly without timeouts
-- 
-- INSTRUCTIONS:
-- 1. Run this script first in Supabase SQL Editor
-- 2. Then run step 2 (index creation)
-- 3. Finally run step 3 (RPC function)
--
-- =============================================================================

-- 1. Ensure pgvector extension is enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add vector column to vectorized_sources table (if it doesn't exist)
DO $$
BEGIN
    -- Add embedding column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'vectorized_sources' AND column_name = 'embedding'
    ) THEN
        ALTER TABLE vectorized_sources ADD COLUMN embedding vector(1536);
        RAISE NOTICE 'Added embedding column with dimension 1536 (OpenAI text-embedding-3-small)';
    ELSE
        RAISE NOTICE 'Embedding column already exists';
    END IF;
    
    -- Check the current type
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'vectorized_sources' 
        AND column_name = 'embedding' 
        AND data_type != 'USER-DEFINED'
    ) THEN
        RAISE NOTICE 'Warning: embedding column exists but may not be vector type. Manual conversion may be needed.';
    END IF;
END $$;

-- 3. Check how many rows we have (this helps plan index strategy)
SELECT 
    COUNT(*) as total_rows,
    COUNT(embedding) as rows_with_embeddings,
    CASE 
        WHEN COUNT(*) > 100000 THEN 'Large dataset - consider IVFFlat index'
        WHEN COUNT(*) > 10000 THEN 'Medium dataset - HNSW should work but may be slow'
        ELSE 'Small dataset - HNSW will be fast'
    END as recommendation
FROM vectorized_sources;

-- 4. Set optimized parameters for large operations
SET work_mem = '256MB';
SET maintenance_work_mem = '512MB';

-- Step 1 completed successfully
SELECT 'Step 1 completed successfully. Proceed to step 2 for index creation.' as result; 