import { useState } from "react";

function useApi(apiFunc) {
  const [data, setData] = useState();
  const [res, setRes] = useState();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  const [tokenValid, setTokenValid] = useState(true);

  const request = async (...args) => {
    setLoading(true);
    const response = await apiFunc(...args);

    if (!response.ok) {
      console.log(response, "res !ok");
      if (response.problem === "NETWORK_ERROR") {
        setLoading(false);
        setNetworkError(true);
        return alert("Please check your internet connection.");
      } else if (response.data.code === "token_not_valid") {
        setLoading(false);
        setData(response.data);
        // console.log("token not valid");
        return setTokenValid(false);
      } else {
        setData(response.data);
        setLoading(false);
        return setError(true);
      }
    }

    setData(response.data);
    setRes(response);
    setNetworkError(false);
    setError(false);
    setLoading(false);
    console.log(response, "rees OK");
  };

  return { res, data, error, networkError, loading, request, tokenValid };
}

export default useApi;
