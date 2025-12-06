"use client";
import React from "react";
import "./AdminStyleProvider.css";

export const AdminStyleProvider: React.FC<{ children?: React.ReactNode }> = ({
  children,
}) => {
  return <>{children}</>;
};
