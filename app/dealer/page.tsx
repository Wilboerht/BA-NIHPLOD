"use client";

import { useEffect } from "react";

/**
 * 经销商面板已移至首页的浮动模态框
 * 此页面用于重定向到首页
 */
export default function DealerPage() {
  useEffect(() => {
    // 检查是否有经销商用户登录
    const userStr = sessionStorage.getItem("user");
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user.role === "DEALER") {
          // 重定向到首页，模态框会自动打开
          window.location.href = "/";
          return;
        }
      } catch (e) {
        console.error("Failed to parse user session:", e);
      }
    }
    
    // 如果没有经销商用户，重定向到首页
    window.location.href = "/";
  }, []);

  return null;
}
