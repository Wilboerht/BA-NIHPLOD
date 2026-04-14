"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, FileText, ShieldCheck, XCircle, Loader2, Building2, Ban
} from "lucide-react";

interface Dealer {
  id: string;
  company_name: string;
  phone: string;
  email: string;
  created_at: string;
}

export default function DealersPage() {
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [userRole, setUserRole] = useState<string | null>(null);
  const [selectedDealer, setSelectedDealer] = useState<Dealer | null>(null);
  const [dealerCerts, setDealerCerts] = useState<any[]>([]);
  const [isCertsLoading, setIsCertsLoading] = useState(false);
  const [banningId, setBanningId] = useState<string | null>(null);

  const fetchUserRole = useCallback(async () => {
    try {
      const userStr = sessionStorage.getItem("user");
      if (userStr) {
        const user = JSON.parse(userStr);
        setUserRole(user.role ?? null);
      }
    } catch (err) {
      console.warn("Failed to get user role:", err);
    }
  }, []);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/db/dealers");
      if (!response.ok) throw new Error("获取经销商列表失败");
      const result = await response.json();
      if (Array.isArray(result.data)) {
        setDealers(result.data);
      }
    } catch (err) {
      console.error("Error fetching dealers:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchDealerCerts = useCallback(async (dealer: Dealer) => {
    if (!dealer?.id) return;
    setIsCertsLoading(true);
    setSelectedDealer(dealer);
    try {
      const response = await fetch(`/api/db/dealers/${ dealer.id }/certificates`);
      if (!response.ok) throw new Error("获取证书失败");
      const result = await response.json();
      setDealerCerts(result.data || []);
    } catch (err) {
      console.error("Error fetching certificates:", err);
      setDealerCerts([]);
    } finally {
      setIsCertsLoading(false);
    }
  }, []);

  const handleBan = useCallback(async (dealer: Dealer) => {
    if (!dealer?.id) return;
    if (!window.confirm(`确定要封禁 [${ dealer.company_name }] 吗？`)) return;

    setBanningId(dealer.id);
    try {
      const userStr = sessionStorage.getItem("user");
      const adminId = userStr ? JSON.parse(userStr).id : null;
      const response = await fetch("/api/admin/ban-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminId, profileId: dealer.id })
      });
      if (response.ok) {
        setDealers(prev => prev.filter(d => d.id !== dealer.id));
      } else {
        alert("操作失败");
      }
    } catch (err) {
      console.error("Error banning dealer:", err);
      alert("操作失败");
    } finally {
      setBanningId(null);
    }
  }, []);

  useEffect(() => {
    fetchUserRole();
    fetchData();
  }, [fetchUserRole, fetchData]);

  const filteredDealers = useMemo(
    () => dealers.filter(d =>
      d.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (d.phone || "").toLowerCase().includes(searchQuery.toLowerCase())
    ),
    [dealers, searchQuery]
  );

  return (
    <div className="px-8 md:px-12 py-8 w-full max-w-7xl mx-auto flex flex-col flex-1 min-h-0">
      <div className="mb-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <Building2 className="w-7 h-7" />
            经销商管理
          </h1>
          <p className="text-slate-500 text-sm">管理已授权经销商</p>
        </motion.div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="py-4 border-b border-slate-100/50">
          <div className="relative w-full max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="搜索经销商..."
              value={ searchQuery }
              onChange={ (e) => setSearchQuery(e.target.value) }
              className="w-full bg-slate-50 border border-slate-100 rounded-lg pl-10 pr-4 py-2 text-sm outline-none focus:bg-white focus:border-slate-300 transition-all"
            />
          </div>
        </div>

        <div className="overflow-auto flex-1 min-h-0">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-300">
              <Loader2 className="w-6 h-6 animate-spin mb-2" />
              <span className="text-xs">加载中...</span>
            </div>
          ) : filteredDealers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <Building2 className="w-12 h-12 mb-2 opacity-20" />
              <p className="text-sm">暂无经销商</p>
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-y border-slate-100 text-xs font-bold text-slate-500 uppercase">
                <tr>
                  <th className="px-6 py-3">公司名称</th>
                  <th className="px-6 py-3">电话</th>
                  <th className="px-6 py-3">邮箱</th>
                  <th className="px-6 py-3">创建时间</th>
                  <th className="px-6 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDealers.map((dealer) => (
                  <tr key={ dealer.id } className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-3 font-medium">{ dealer.company_name }</td>
                    <td className="px-6 py-3 text-slate-600">{ dealer.phone }</td>
                    <td className="px-6 py-3 text-slate-600 text-xs">{ dealer.email }</td>
                    <td className="px-6 py-3 text-slate-500">
                      { new Date(dealer.created_at).toLocaleDateString() }
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <motion.button
                          whileHover={ { scale: 1.05 } }
                          whileTap={ { scale: 0.95 } }
                          onClick={ () => fetchDealerCerts(dealer) }
                          disabled={ isCertsLoading && selectedDealer?.id === dealer.id }
                          className="p-2 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                        >
                          <FileText className="w-4 h-4 text-blue-600" />
                        </motion.button>
                        
                        {userRole === "admin" && (
                          <motion.button
                            whileHover={ { scale: 1.05 } }
                            whileTap={ { scale: 0.95 } }
                            onClick={ () => handleBan(dealer) }
                            disabled={ banningId === dealer.id }
                            className="p-2 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {banningId === dealer.id ? (
                              <Loader2 className="w-4 h-4 text-red-600 animate-spin" />
                            ) : (
                              <Ban className="w-4 h-4 text-red-600" />
                            )}
                          </motion.button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Certificates Modal */}
      <AnimatePresence>
        {selectedDealer && (
          <motion.div
            initial={ { opacity: 0 } }
            animate={ { opacity: 1 } }
            exit={ { opacity: 0 } }
            className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center"
            onClick={ () => setSelectedDealer(null) }
          >
            <motion.div
              initial={ { scale: 0.95, opacity: 0 } }
              animate={ { scale: 1, opacity: 1 } }
              exit={ { scale: 0.95, opacity: 0 } }
              onClick={ (e) => e.stopPropagation() }
              className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-auto"
            >
              <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
                <h2 className="text-lg font-bold">{ selectedDealer.company_name } - 证书列表</h2>
                <button
                  onClick={ () => setSelectedDealer(null) }
                  className="p-1 hover:bg-slate-100 rounded"
                >
                  <XCircle className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <div className="p-6">
                {isCertsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
                  </div>
                ) : dealerCerts.length === 0 ? (
                  <p className="text-slate-500 text-center">暂无证书</p>
                ) : (
                  <div className="space-y-3">
                    {dealerCerts.map((cert) => (
                      <div key={ cert.id } className="p-3 border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{ cert.product_name }</span>
                          <span className={`text-xs px-2 py-1 rounded font-medium ${
                            cert.status === "issued"
                              ? "bg-green-100 text-green-700"
                              : "bg-yellow-100 text-yellow-700"
                          }`}>
                            { cert.status === "issued" ? "已发放" : "待发放" }
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          { new Date(cert.created_at).toLocaleDateString() }
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
