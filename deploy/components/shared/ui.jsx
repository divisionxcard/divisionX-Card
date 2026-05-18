export function Badge({ series }) {
  const c = { OP:"bg-blue-100 text-blue-700", PRB:"bg-purple-100 text-purple-700", EB:"bg-emerald-100 text-emerald-700", FB:"bg-orange-100 text-orange-700", UB:"bg-red-100 text-red-700", OTHER:"bg-gray-200 text-gray-700" }
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${c[series] ?? "bg-gray-100 text-gray-600"}`}>{series}</span>
}

export function StatusDot({ status }) {
  return <span className={`inline-block w-2 h-2 rounded-full mr-1 ${status==="active"?"bg-green-500":"bg-gray-400"}`}/>
}
