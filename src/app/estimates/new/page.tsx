"use client";

import { useState } from "react";
import AppShell from "../../components/AppShell";
import Button from "../../components/Button";
import InputField from "../../components/InputField";
import Card from "../../components/Card";

export default function NewEstimatePage() {
  const [customerName, setCustomerName] = useState("");
  const [projectAddress, setProjectAddress] = useState("");
  const [estimateAmount, setEstimateAmount] = useState("");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSave = () => {
    setMessage("");
    setError("");

    if (!customerName || !projectAddress || !estimateAmount) {
      setError("Please fill out all fields before saving.");
      return;
    }

    console.log({
      customerName,
      projectAddress,
      estimateAmount,
    });

    setCustomerName("");
    setProjectAddress("");
    setEstimateAmount("");

    setMessage("Estimate saved successfully.");
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
          Trimax
        </p>

        <h1 className="mt-3 text-5xl font-bold">New Estimate</h1>

        <Card className="mt-8">
          <div className="grid gap-5">
            <InputField
              label="Customer Name"
              placeholder="Enter customer name"
              value={customerName}
              onChange={setCustomerName}
            />

            <InputField
              label="Project Address"
              placeholder="Enter address"
              value={projectAddress}
              onChange={setProjectAddress}
            />

            <InputField
              label="Estimate Amount"
              placeholder="$0.00"
              value={estimateAmount}
              onChange={setEstimateAmount}
            />

            {error && (
              <p className="rounded-2xl bg-red-500/20 px-4 py-3 text-sm text-red-300">
                {error}
              </p>
            )}

            {message && (
              <p className="rounded-2xl bg-green-500/20 px-4 py-3 text-sm text-green-300">
                {message}
              </p>
            )}

            <Button onClick={handleSave}>
              Save Estimate
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}