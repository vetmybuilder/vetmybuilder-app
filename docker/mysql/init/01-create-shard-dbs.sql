-- Create the per-worker shard databases (idempotent)
CREATE DATABASE IF NOT EXISTS `vetmybuilder_test_s1_4_w0` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS `vetmybuilder_test_s1_4_w1` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS `vetmybuilder_test_s1_4_w2` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS `vetmybuilder_test_s1_4_w3` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS `vetmybuilder_test_s1_4_w4` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- Create the per-shard databases used by the API (Playwright) tests
CREATE DATABASE IF NOT EXISTS `vetmybuilder_test_s1_4` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS `vetmybuilder_test_s2_4` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS `vetmybuilder_test_s3_4` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS `vetmybuilder_test_s4_4` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
