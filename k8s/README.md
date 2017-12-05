# useful gtm-agent k8s commands

#### get deployment details
```
kubectl describe deployment gtm-agent-deployment
```
#### get list of pods
```
kubectl get pods
```

#### follow logs for a given pod
```
kubectl logs -f <podName>
```

#### get a snapshot of logs for all pods
```
kubectl logs -l app=gtm-agent
```

#### scale out pod replicas (eg.5 - set to 0 to take offline)
```
kubectl scale --replicas=5 deployment/gtm-agent-deployment
```