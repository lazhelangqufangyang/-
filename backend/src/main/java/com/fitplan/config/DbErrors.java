package com.fitplan.config;

import java.sql.SQLException;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 数据库报错翻成一句能照着做的人话，和 Node 版 dbError 保持一致。
 * 界面上会原样显示这里返回的句子，所以除了「缺哪张表、哪个库、连的哪台」这类他自己能动手的信息，
 * SQLException 的原文一律不外传 —— 那句里带着 SQL 片段和库名，公网上的陌生人也读得到。
 */
public final class DbErrors {

    private static final Pattern MISSING_TABLE = Pattern.compile("Table '([^']+)' doesn't exist");
    private static final String GENERIC = "数据库这边出了点意外，这条没成。";

    private DbErrors() {
    }

    public static String humanize(Throwable error, String database, String host, int port) {
        SQLException sql = findSql(error);
        int code = sql == null ? 0 : sql.getErrorCode();
        if (code == 1045) {
            return "数据库账号或密码不对（查 MYSQL_USER / MYSQL_PASSWORD）";
        }
        if (code == 1146) {
            String table = missingTable(sql);
            return table == null
                ? "库里少一张表，先跑一次建表（server/schema.sql）或重启后端让它自己补。"
                : "库里没有 " + table + " 这张表，先跑一次建表或重启后端。";
        }
        if (code == 1049) {
            return "数据库 " + database + " 不存在，先 CREATE DATABASE " + database + ";";
        }
        if (code == 1044 || code == 1142) {
            return "这个数据库账号没有 " + database + " 库的权限，给它 GRANT 一下。";
        }
        String message = sql == null ? String.valueOf(error.getMessage()) : sql.getMessage();
        if (message != null && message.contains("Connection refused")) {
            return "连不上 " + host + ":" + port + "，MySQL 服务没起？";
        }
        return GENERIC;
    }

    private static String missingTable(SQLException sql) {
        if (sql == null || sql.getMessage() == null) {
            return null;
        }
        Matcher m = MISSING_TABLE.matcher(sql.getMessage());
        return m.find() ? m.group(1) : null;
    }

    private static SQLException findSql(Throwable error) {
        Throwable cursor = error;
        while (cursor != null) {
            if (cursor instanceof SQLException sql) {
                return sql;
            }
            cursor = cursor.getCause();
        }
        return null;
    }
}
