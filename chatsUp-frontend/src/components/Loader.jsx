import React from "react";
// import Lottie from "react-lottie";

// import yellowLoader from "../../images/yellow-circle-loader.json";

function Loader({ className }) {
  // const defaultOptions = {
  //   loop: true,
  //   autoplay: true,
  //   animationData: yellowLoader,
  // };

  return (
    <div
      className={`flex justify-center items-center ${
        className ? className : "h-[90vh]"
      } `}
    >
      LOADING...
      {/* <Lottie options={defaultOptions} width={250} /> */}
    </div>
  );
}

export default Loader;
