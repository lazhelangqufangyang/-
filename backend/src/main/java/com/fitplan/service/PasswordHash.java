package com.fitplan.service;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.security.spec.InvalidKeySpecException;
import java.util.Base64;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

/**
 * 口令只以 PBKDF2-HMAC-SHA256 的散列入库，格式是「迭代数$盐$散列」三段，
 * 以后调迭代数不用洗库：老口令照旧按自己那段迭代数验。
 */
public final class PasswordHash {

    private static final String ALGORITHM = "PBKDF2WithHmacSHA256";
    private static final int ITERATIONS = 120000;
    private static final int KEY_BITS = 256;
    private static final int SALT_BYTES = 16;
    private static final String SEPARATOR = "\\$";
    private static final SecureRandom RANDOM = new SecureRandom();

    private PasswordHash() {
    }

    public static String create(String password) {
        byte[] salt = new byte[SALT_BYTES];
        RANDOM.nextBytes(salt);
        byte[] hash = derive(password, salt, ITERATIONS);
        Base64.Encoder encoder = Base64.getEncoder();
        return ITERATIONS + "$" + encoder.encodeToString(salt) + "$" + encoder.encodeToString(hash);
    }

    /**
     * 比对走 MessageDigest.isEqual：逐字节比的方式会让「错在第几位」从耗时上读出来。
     * 库里存的格式不认识就当没匹配上，不拿异常当登录失败用。
     */
    public static boolean matches(String password, String stored) {
        if (password == null || stored == null) {
            return false;
        }
        String[] parts = stored.split(SEPARATOR);
        if (parts.length != 3) {
            return false;
        }
        try {
            int iterations = Integer.parseInt(parts[0]);
            byte[] salt = Base64.getDecoder().decode(parts[1]);
            byte[] expected = Base64.getDecoder().decode(parts[2]);
            return MessageDigest.isEqual(derive(password, salt, iterations), expected);
        } catch (IllegalArgumentException e) {
            // 迭代数不是数、盐或散列不是合法 base64、口令散不出来，全算「没匹配上」
            return false;
        }
    }

    private static byte[] derive(String password, byte[] salt, int iterations) {
        PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, iterations, KEY_BITS);
        try {
            return SecretKeyFactory.getInstance(ALGORITHM).generateSecret(spec).getEncoded();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("这台 JVM 没有 " + ALGORITHM, e);
        } catch (InvalidKeySpecException e) {
            throw new IllegalArgumentException("口令散列不出来：盐或迭代数不成形", e);
        } finally {
            spec.clearPassword();
        }
    }
}
