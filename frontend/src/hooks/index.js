// ============ usePlatformStats Hook (UPDATED) ============
export const usePlatformStats = () => {
  const { contracts } = useWeb3(); // ✅ Use contracts from Web3Context
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // ✅ Try frontend-direct call first (faster)
      if (contracts.lendingPoolLens) {
        console.log("📊 Fetching platform stats from contract...");
        const result = await contracts.lendingPoolLens.getPlatformStats();

        const statsData = {
          totalLoans: result[0].toString(),
          totalOffers: result[1].toString(),
          activeLenderOffers: Number(result[2]),
          activeBorrowerRequests: Number(result[3]),
          platformFeeRate: (Number(result[4]) / 100).toFixed(2) + "%",
        };

        console.log("✅ Platform stats:", statsData);
        setStats(statsData);
      } else {
        // ✅ Fallback to API if contracts not loaded
        console.log("📊 Fetching platform stats from API...");
        const data = await api.getPlatformStats();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch platform stats:", err);
      setError(err.message);

      // ✅ Set default values on error
      setStats({
        totalLoans: "0",
        totalOffers: "0",
        activeLenderOffers: 0,
        activeBorrowerRequests: 0,
        platformFeeRate: "1.00%",
      });
    } finally {
      setLoading(false);
    }
  }, [contracts]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, error, refetch: fetchStats };
};
