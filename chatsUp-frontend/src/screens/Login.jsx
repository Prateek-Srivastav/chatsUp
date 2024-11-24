import React, { useState } from "react";

const Login = () => {
  const [username, setUsername] = useState("");

  const handleSubmit = (e) => {
    localStorage.setItem("user", username);
    console.log(e.target);
  };

  // if (!username)
  return (
    <div className="flex flex-col">
      <input name="username" onChange={(e) => setUsername(e.target.value)} />
      <button title="Submit" onClick={(e) => handleSubmit(e)} className="">
        Submit
      </button>
    </div>
  );

  // return <div></div>;
};

export default Login;
