#include <cuda_runtime.h>

__global__ void test_kernel() {}

int main() {
    test_kernel<<<1,1>>>();
    return cudaDeviceSynchronize();
}
