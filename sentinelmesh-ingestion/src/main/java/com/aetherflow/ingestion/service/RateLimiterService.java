package com.aetherflow.ingestion.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
@RequiredArgsConstructor
public class RateLimiterService {

    private final StringRedisTemplate redisTemplate;

    private static final int LIMIT_PER_MINUTE = 150;

    public boolean isAllowed(String host) {
        long currentWindow = Instant.now().getEpochSecond() / 60;
        String key = "rate:limit:" + host + ":" + currentWindow;

        try {
            Long count = redisTemplate.opsForValue().increment(key, 1);
            if (count != null && count == 1) {
                redisTemplate.expire(key, 65, TimeUnit.SECONDS);
            }
            if (count != null && count > LIMIT_PER_MINUTE) {
                log.warn("Rate limit exceeded for host: {}. Requests in window: {}", host, count);
                return false;
            }
            return true;
        } catch (Exception e) {
            log.error("Redis connection error, falling back to allowing request: {}", e.getMessage());
            return true; // fail open, don't block traffic if Redis is down
        }
    }
}
