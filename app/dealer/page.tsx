"use client";

import { useEffect } from "react";

/**
 * 经销商面板已移至首页的浮动模态框
 * 此页面用于重定向到首页
 */
export default function DealerPage() {
  useEffect(() => {
    // 检查是否有经销商用户登录
    fetch('/api/auth/me')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.user?.role === "DEALER") {
          // 重定向到首页，模态框会自动打开
          window.location.href = "/";
        } else {
          window.location.href = "/";
        }
      })
      .catch(() => {
        window.location.href = "/";
      });
  }, []);

  return null;
}
