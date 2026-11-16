import { useEffect, useState } from 'react';
import { Card } from '../../components/ui';
import { getSession, getToken } from '../../lib/api';

const GROUPS = [
  {
    title: '账号',
    items: [
      {
        href: '/settings/profile',
        title: '我的档案',
        desc: '身体数据、一周练哪几天、想练成什么样',
        icon: '☺',
      },
      {
        href: '/settings/account',
        title: '账号',
        desc: '支付宝登录；云端只认 uid 和订阅',
        icon: '◎',
      },
    ],
  },
  {
    title: '模型与数据',
    items: [
      {
        href: '/settings/model',
        title: '链接大模型',
        desc: 'baseURL / apiKey / model，Key 只存这台设备',
        icon: '◈',
      },
      {
        href: '/settings/data',
        title: '数据与备份',
        desc: '导出、导入、云端整份备份和拉回、清空本机',
        icon: '≣',
      },
      {
        href: '/settings/offline',
        title: '离线与安装',
        desc: '装到主屏，断网能做什么、不能做什么',
        icon: '▤',
      },
    ],
  },
  {
    title: '关于',
    items: [
      {
        href: '/settings/safety',
        title: '安全边界',
        desc: '不诊断、不冲极限、不断食',
        icon: '⚠',
      },
    ],
  },
];

export default function SettingsIndex({ go }) {
  const [role, setRole] = useState(null);

  useEffect(() => {
    if (!getToken()) return;
    getSession()
      .then((session) => setRole(session.role))
      .catch(() => setRole(null));
  }, []);

  return (
    <div>
      {role === 'ADMIN' ? (
        <div className="setgroup">
          <div className="setgroup-title">管理</div>
          <Card tight className="setcard">
            <button type="button" className="setrow hot" onClick={() => go('/admin')}>
              <span className="setrow-ico">▦</span>
              <span className="setrow-text">
                <b>管理后台</b>
                <em>账号停用 / 启用、开通 VIP、订单与操作日志</em>
              </span>
              <span className="setrow-arrow">›</span>
            </button>
          </Card>
        </div>
      ) : null}

      {GROUPS.map((group) => (
        <div className="setgroup" key={group.title}>
          <div className="setgroup-title">{group.title}</div>
          <Card tight className="setcard">
            {group.items.map((item) => (
              <button
                key={item.href}
                type="button"
                className="setrow"
                onClick={() => go(item.href)}
              >
                <span className="setrow-ico">{item.icon}</span>
                <span className="setrow-text">
                  <b>{item.title}</b>
                  <em>{item.desc}</em>
                </span>
                <span className="setrow-arrow">›</span>
              </button>
            ))}
          </Card>
        </div>
      ))}

      <div className="hintblock">
        记录默认只存在这个浏览器里。登录后在「数据与备份」点一次「传到云端」，上传的是那一刻的全部记录；
        不点就没有任何东西离开设备。大模型 Key 不上传。
      </div>
    </div>
  );
}
