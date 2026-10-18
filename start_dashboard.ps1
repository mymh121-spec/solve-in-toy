param([switch]$Demo)

$arguments = @("app.py")
if ($Demo) { $arguments += "--demo" }

python @arguments
